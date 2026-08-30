import { Agent, callable, getAgentByName, getCurrentAgent, routeAgentRequest, type Connection, type ConnectionContext } from 'agents';

export type VoteRoomState = {
	question: string;
	options: {
		id: string;
		label: string;
		votes: number;
	}[];
	closed: boolean;
	closesAt: number | null;
}

type ConnectionState = {
	city: string;
	readonly: boolean;
}

export type VoteRecord = {
	id: number;
	option_id: string;
	option_label: string;
	voted_at: number;
	city: string | null;
}

export class VoteRoomAgent extends Agent<Env, VoteRoomState> {
	initialState = {
		question: "",
		options: [],
		closed: false,
		closesAt: null,
	}

	private requireWritableConnection() {
		const { connection } = getCurrentAgent<VoteRoomAgent>();
		const connectionState = connection?.state as ConnectionState | undefined;

		if (
			!connection ||
			this.isConnectionReadonly(connection) ||
			connectionState?.readonly === true
		) {
			throw new Error("투표는 읽기 전용 관전자 모드에서는 불가능합니다.");
		}

		return { connection, connectionState };
	}

	@callable()
	vote(optionId: string){
		const { connectionState } = this.requireWritableConnection();

		if(
			this.state.closed ||
			(this.state.closesAt !== null && Date.now() >= this.state.closesAt)
		) {
			if (!this.state.closed) {
				this.setState({
					...this.state,
					closed: true,
				});
			}
			throw new Error("이미 종료된 투표입니다.")
		}

		const option  = this.state.options.find((option)=> option.id === optionId)

		if(!option) throw new Error("존재하지 않는 선택지입니다.");

		const city = connectionState?.city ?? "unknown";
		const votedAt = Date.now();

		void this.sql`
		INSERT INTO votes(
			option_id,
			option_label,
			voted_at,
			city
		) VALUES (
			${option.id},
			${option.label},
			${votedAt},
			${city}
		)
		`;

		  const options = this.state.options.map((currentOption) =>
    currentOption.id === optionId
      ? {
          ...currentOption,
          votes: currentOption.votes + 1,
        }
      : currentOption,
  );

  this.setState({
	...this.state,
	options,
  })

	}

	@callable()
	addOption(label:string){
		this.requireWritableConnection();
		const normalizedLabel = label.trim();

		if (!normalizedLabel) {
			throw new Error("선택지 내용을 입력해주세요.");
		}

		if (this.state.closed) {
			throw new Error("종료된 투표에는 선택지를 추가할 수 없습니다.");
		}

		const optionId = crypto.randomUUID();
		this.setState({
			...this.state,
			options: [...this.state.options, {
				id: optionId,
				label: normalizedLabel,
				votes: 0,
			}]
		})
	}

	@callable()
	async reset() {
		this.requireWritableConnection();
		const closeSchedules = (await this.listSchedules({ type: "scheduled" }))
			.filter((schedule) => schedule.callback === "closePoll");

		await Promise.all(
			closeSchedules.map((schedule) => this.cancelSchedule(schedule.id)),
		);

		this.setState({
			...this.state,
			closed: false,
			closesAt: null,
			options: this.state.options.map((option) => ({
				...option,
				votes: 0,
			})),
		})
	}

	onStart() {

		void this.sql`
		CREATE TABLE IF NOT EXISTS votes(
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			option_id TEXT NOT NULL,
			option_label TEXT NOT NULL,
			voted_at INTEGER NOT NULL,
			city TEXT
		)
		`
	}

	closePoll() {
		this.setState({
			...this.state,
			closed: true,
		})
	}

	onConnect(
		connection: Connection<ConnectionState>,
		ctx: ConnectionContext,
	) {
		const url = new URL(ctx.request.url);
		const token = url.searchParams.get("token");

		if(!token || token !== this.env.ROOM_TOKEN) {
			connection.close(1008, "Invalid room token");
			return;
		}

		const city = ctx.request.cf?.city;
		const readonly = url.searchParams.get("readonly") === "true";

		connection.setState({
			city: typeof city === "string" ? city : "unknown",
			readonly,
		})
	}

	shouldConnectionBeReadonly(_connection: Connection, ctx: ConnectionContext): boolean {
		const url = new URL(ctx.request.url);

		return url.searchParams.get("readonly") === "true"
	}


	async openPoll(question: string, optionLabels: string[], closesAt:number) {
		if (this.state.closesAt !== null) {
			throw new Error("이미 투표가 진행 중입니다.")
		}

		await this.schedule(
			new Date(closesAt),
			"closePoll"
		)

		this.setState({
			question,
			options: optionLabels.map((label) => ({
				id: crypto.randomUUID(),
				label,
				votes: 0,
			})),
			closed: false,
			closesAt,
		})

	}

	@callable()
	loadHistory() {
		return this.sql<VoteRecord>`
    SELECT
      id,
      option_id,
      option_label,
      voted_at,
      city
    FROM votes
    ORDER BY voted_at DESC
    LIMIT 100
  `;
}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (request.method === "POST" && url.pathname === "/api/polls/open") {
			if (request.headers.get("Authorization") !== `Bearer ${env.ROOM_TOKEN}`) {
				return new Response("Unauthorized", { status: 401 });
			}

			let body: unknown;

			try {
				body = await request.json();
			} catch {
				return new Response("Invalid JSON", { status: 400 });
			}

			if (typeof body !== "object" || body === null) {
				return new Response("Invalid request body", { status: 400 });
			}

			const { roomName, question, options, closesAt } = body as {
				roomName?: unknown;
				question?: unknown;
				options?: unknown;
				closesAt?: unknown;
			};

			if (typeof roomName !== "string" || roomName.trim() === "") {
				return new Response("roomName is required", { status: 400 });
			}

			if (typeof question !== "string" || question.trim() === "") {
				return new Response("question is required", { status: 400 });
			}

			if (
				!Array.isArray(options) ||
				options.length < 2 ||
				options.some((option) => typeof option !== "string" || option.trim() === "")
			) {
				return new Response("at least two options are required", { status: 400 });
			}

			if (
				typeof closesAt !== "number" ||
				!Number.isFinite(closesAt) ||
				closesAt <= Date.now()
			) {
				return new Response("closesAt must be a future timestamp", { status: 400 });
			}

			const agent = await getAgentByName<Env, VoteRoomAgent>(
				env.VoteRoomAgent,
				roomName,
			);

			try {
				await agent.openPoll(
					question.trim(),
					options.map((option) => option.trim()),
					closesAt,
				);
			} catch (error) {
				return new Response(
					error instanceof Error ? error.message : "Failed to open poll",
					{ status: 409 },
				);
			}

			return Response.json({ roomName, closesAt }, { status: 201 });
		}

		const agentResponse = await routeAgentRequest(request, env);
		if (agentResponse) return agentResponse;
		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
