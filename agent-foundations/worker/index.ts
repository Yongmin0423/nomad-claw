import { Agent, callable, getCurrentAgent, routeAgentRequest, type Connection, type ConnectionContext, type WSMessage } from 'agents';

export type ChattingRoomState = {
	currentlyOnline: number;
}

export class ChattingRoomAgent extends Agent<Env,ChattingRoomState> {
	initialState = {
		currentlyOnline: 0
	};
	
	@callable()
	increment(){
		this.setState({
			currentlyOnline: this.state.currentlyOnline + 1
		});
	}

	@callable()	
	decrement(){
		this.setState({
			currentlyOnline: this.state.currentlyOnline - 1
		});
	}

	shouldConnectionBeReadonly(_connection: Connection, ctx: ConnectionContext) {
		const url = new URL(ctx.request.url);
		const nickname = url.searchParams.get('name') ?? 'anon';
		return nickname.includes('admin');
	}

	onConnect(connection:Connection, ctx: ConnectionContext): void | Promise<void> {
		const url = new URL(ctx.request.url);
		const nickname = url.searchParams.get('name') ?? 'anon';

		connection.setState({
			nickname,
		})

		this.setState({
			currentlyOnline: this.state.currentlyOnline + 1
		})
	}

	onClose(): void | Promise<void> {
		this.setState({
			currentlyOnline: this.state.currentlyOnline - 1
		})	
	}

	onMessage(connection: Connection<{nickname:string}>, message: WSMessage) {
		const messageObj = {
			nickcname: connection.state.nickname,
			message: message.toString(),
			created_at: Date.now(),
		};
		void this.sql`
		INSERT INTO messages (nickname, message, created_at) VALUES(${messageObj.nickcname}, ${messageObj.message}, ${messageObj.created_at});
		`
		//this.broadcast(JSON.stringify(messageObj), [connection.id]);
		this.broadcast(JSON.stringify(messageObj));

	}

	@callable()
	loadHistory(){
		const {connection} = getCurrentAgent<ChattingRoomAgent>();
		// this.setConnectionReadonly(connection, true)
		console.log(connection.state);
		return this.sql`SELECT * FROM messages ORDER BY created_at ASC LIMIT 100`
	}

	onStart(){
		void this.sql`
		CREATE TABLE IF NOT EXISTS messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nickname TEXT NOT NULL,
			message TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
		)
		`
	}

	@callable()
	clearHistory(){
		void this.sql`DELETE FROM messages`;
	}
		
	

	// onStateChanged(state: ChattingRoomState, source: Connection | 'server'): void {
	// 	console.log("new state", state);
	// 	console.log('who did it', source)
	// }

// 	validateStateChange(_nextState: ChattingRoomState, source: Connection | 'server'): void {
// 		if (source !== 'server') throw new Error('cant do this');

// 	}
}

export default {
	async fetch(request, env) {
		// 프론트엔드와 웹소켓연결을 맺기 위한 함수
		const agentResponse = await routeAgentRequest(request, env);
		if (agentResponse) return agentResponse;
		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
