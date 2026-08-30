import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAgent } from "agents/react";
import type { VoteRoomAgent, VoteRoomState } from "../worker";

export type RoomAccess = {
	roomName: string;
	roomToken: string;
	readonly: boolean;
};

type JoinRoomFormProps = {
	onCreate: (access: RoomAccess) => void;
	onJoin: (access: RoomAccess) => void;
};

function JoinRoomForm({ onCreate, onJoin }: JoinRoomFormProps) {
	const [roomName, setRoomName] = useState("");
	const [roomToken, setRoomToken] = useState("");
	const [readonlyFromUrl] = useState(
		() => new URLSearchParams(window.location.search).get("readonly") === "true",
	);
	const [readonly, setReadonly] = useState(readonlyFromUrl);
	const [error, setError] = useState<string | null>(null);

	function getAccess() {
		const normalizedRoomName = roomName.trim();
		const normalizedRoomToken = roomToken.trim();

		if (!normalizedRoomName) {
			setError("방 이름을 입력해주세요.");
			return null;
		}

		if (!normalizedRoomToken) {
			setError("방 토큰을 입력해주세요.");
			return null;
		}

		setError(null);
		return {
			roomName: normalizedRoomName,
			roomToken: normalizedRoomToken,
			readonly,
		};
	}

	function handleCreate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const access = getAccess();
		if (!access) return;

		if (access.readonly) {
			onJoin(access);
			return;
		}

		onCreate(access);
	}

	function handleJoin() {
		const access = getAccess();
		if (access) onJoin(access);
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12 text-slate-100">
			<section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-7 shadow-2xl shadow-black/30 backdrop-blur sm:p-9">
				<div className="mb-8">
					<p className="mb-3 text-sm font-semibold tracking-[0.2em] text-cyan-400 uppercase">
						Live Poll
					</p>
					<h1 className="text-3xl font-bold tracking-tight">투표 시작하기</h1>
					<p className="mt-3 text-sm leading-6 text-slate-400">
						새 투표를 만들거나 이미 열린 투표방에 입장하세요.
					</p>
					<p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
						테스트 토큰: <strong className="font-bold text-amber-100">123</strong>
					</p>
				</div>

				<form className="space-y-5" onSubmit={handleCreate}>
					<label className="block">
						<span className="mb-2 block text-sm font-medium text-slate-200">방 이름</span>
						<input
							autoComplete="off"
							className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
							name="roomName"
							onChange={(event) => setRoomName(event.target.value)}
							placeholder="예: lunch-poll"
							value={roomName}
						/>
					</label>

					<label className="block">
						<span className="mb-2 block text-sm font-medium text-slate-200">방 토큰</span>
						<input
							autoComplete="off"
							className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
							name="roomToken"
							onChange={(event) => setRoomToken(event.target.value)}
							placeholder="초대받은 토큰을 입력하세요"
							type="password"
							value={roomToken}
						/>
					</label>

					<label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.05]">
						<input
							checked={readonly}
							className="mt-0.5 size-4 accent-cyan-400"
							disabled={readonlyFromUrl}
							onChange={(event) => setReadonly(event.target.checked)}
							type="checkbox"
						/>
						<span>
							<span className="block text-sm font-medium text-slate-200">관전자로 입장</span>
							<span className="mt-1 block text-xs leading-5 text-slate-500">
								{readonlyFromUrl
									? "URL에 readonly=true가 지정되어 관전자 모드로만 접속합니다."
									: "실시간 결과만 볼 수 있고 투표에는 참여할 수 없습니다."}
							</span>
						</span>
					</label>

					{error ? (
						<p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300" role="alert">
							{error}
						</p>
					) : null}

					<button
						className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
						type="submit"
					>
						{readonly ? "관전자로 입장" : "새 투표 만들기"}
					</button>
					{!readonly ? (
						<button
							className="w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/5"
							onClick={handleJoin}
							type="button"
						>
							이미 열린 투표방 입장
						</button>
					) : null}
				</form>
			</section>
		</main>
	);
}

type RoomReadyProps = {
	access: RoomAccess;
	onConnect: () => void;
	onLeave: () => void;
};

function RoomReady({ access, onConnect, onLeave }: RoomReadyProps) {
	const [question, setQuestion] = useState("");
	const [optionLabels, setOptionLabels] = useState(["", ""]);
	const [durationMinutes, setDurationMinutes] = useState(5);
	const [opening, setOpening] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleOpenPoll(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const normalizedQuestion = question.trim();
		const normalizedOptions = optionLabels.map((option) => option.trim());

		if (!normalizedQuestion) {
			setError("투표 질문을 입력해주세요.");
			return;
		}

		if (normalizedOptions.length < 2 || normalizedOptions.some((option) => !option)) {
			setError("선택지를 2개 이상 입력해주세요.");
			return;
		}

		if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
			setError("투표 시간은 1분 이상이어야 합니다.");
			return;
		}

		const closesAt = Date.now() + durationMinutes * 60 * 1000;

		setOpening(true);
		setError(null);

		try {
			const response = await fetch("/api/polls/open", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${access.roomToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					roomName: access.roomName,
					question: normalizedQuestion,
					options: normalizedOptions,
					closesAt,
				}),
			});

			if (!response.ok) {
				const message = await response.text();
				throw new Error(message || "투표방을 열지 못했습니다.");
			}

			await response.json();
			onConnect();
		} catch (error) {
			setError(error instanceof Error ? error.message : "투표방을 열지 못했습니다.");
		} finally {
			setOpening(false);
		}
	}

	function updateOption(index: number, value: string) {
		setOptionLabels((current) =>
			current.map((option, optionIndex) => (optionIndex === index ? value : option)),
		);
	}

	function removeOption(index: number) {
		setOptionLabels((current) => current.filter((_, optionIndex) => optionIndex !== index));
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100">
			<section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl shadow-black/30">
				<div className="text-center">
					<p className="text-sm font-semibold text-cyan-400">New Poll</p>
					<h1 className="mt-3 text-2xl font-bold">새 투표 만들기</h1>
					<p className="mt-2 text-sm text-slate-400">
						<span className="font-medium text-slate-200">{access.roomName}</span>방을 열 때 질문과 선택지가 함께 등록됩니다.
					</p>
				</div>

				<form className="mt-6 space-y-4" onSubmit={handleOpenPoll}>
						<label className="block">
							<span className="mb-2 block text-sm font-medium text-slate-200">투표 질문</span>
							<input
								className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
								onChange={(event) => setQuestion(event.target.value)}
								placeholder="예: 오늘 점심은 무엇을 먹을까요?"
								value={question}
							/>
						</label>

						<fieldset>
							<legend className="mb-2 text-sm font-medium text-slate-200">초기 선택지</legend>
							<div className="space-y-2">
								{optionLabels.map((option, index) => (
									<div className="flex gap-2" key={index}>
										<input
											aria-label={`선택지 ${index + 1}`}
											className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
											onChange={(event) => updateOption(index, event.target.value)}
											placeholder={`선택지 ${index + 1}`}
											value={option}
										/>
										{optionLabels.length > 2 ? (
											<button
												aria-label={`선택지 ${index + 1} 삭제`}
												className="rounded-xl border border-white/10 px-3 text-slate-400 transition hover:bg-white/5 hover:text-red-300"
												onClick={() => removeOption(index)}
												type="button"
											>
												삭제
											</button>
										) : null}
									</div>
								))}
							</div>
							<button
								className="mt-2 text-xs font-semibold text-cyan-400 transition hover:text-cyan-300"
								onClick={() => setOptionLabels((current) => [...current, ""])}
								type="button"
							>
								+ 선택지 추가
							</button>
						</fieldset>
						<label className="block">
							<span className="mb-2 block text-sm font-medium text-slate-200">투표 진행 시간</span>
							<div className="relative">
								<input
									className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 pr-14 text-sm outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
									min={1}
									onChange={(event) => setDurationMinutes(event.target.valueAsNumber)}
									type="number"
									value={durationMinutes}
								/>
								<span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-slate-500">분</span>
							</div>
						</label>

						{error ? (
							<p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300" role="alert">
								{error}
							</p>
						) : null}

						<button
							className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
							disabled={opening}
							type="submit"
						>
							{opening ? "투표방 여는 중..." : "질문과 선택지로 투표방 열기"}
						</button>
					</form>

				<button
					className="mt-7 w-full rounded-xl border border-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white/5"
					onClick={onLeave}
					type="button"
				>
					입력으로 돌아가기
				</button>
			</section>
		</main>
	);
}

type VoteRoomConnectionProps = {
	access: RoomAccess;
	onLeave: () => void;
};

function formatRemainingTime(milliseconds: number) {
	const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function VoteRoomConnection({ access, onLeave }: VoteRoomConnectionProps) {
	const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
	const [now, setNow] = useState(0);
	const [newOption, setNewOption] = useState("");
	const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
	const [isAddingOption, setIsAddingOption] = useState(false);
	const [isResetting, setIsResetting] = useState(false);
	const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

	const agent = useAgent<VoteRoomAgent, VoteRoomState>({
		agent: "VoteRoomAgent",
		name: access.roomName,
		query: async () => ({
			token: access.roomToken,
			readonly: access.readonly ? "true" : null,
		}),
		queryDeps: [access.roomToken, access.readonly],
		onOpen: () => setConnectionStatus("connected"),
		onClose: () => setConnectionStatus("disconnected"),
		onError: () => setConnectionStatus("disconnected"),
	});

	const pollState = agent.state;
	const totalVotes = useMemo(
		() => pollState?.options.reduce((sum, option) => sum + option.votes, 0) ?? 0,
		[pollState?.options],
	);
	const deadlinePassed = pollState?.closesAt !== null && pollState?.closesAt !== undefined
		? now >= pollState.closesAt
		: false;
	const isClosed = pollState?.closed === true || deadlinePassed;
	const isPollActive = pollState?.closesAt !== null && pollState?.closesAt !== undefined && !isClosed;

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 500);
		return () => window.clearInterval(timer);
	}, []);

	async function handleVote(optionId: string) {
		setPendingOptionId(optionId);
		setFeedback(null);

		try {
			await agent.stub.vote(optionId);
			setFeedback({ type: "success", message: "투표가 반영됐습니다." });
		} catch (error) {
			setFeedback({ type: "error", message: getErrorMessage(error) });
		} finally {
			setPendingOptionId(null);
		}
	}

	async function handleAddOption(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const normalizedOption = newOption.trim();

		if (!normalizedOption) {
			setFeedback({ type: "error", message: "추가할 선택지를 입력해주세요." });
			return;
		}

		setIsAddingOption(true);
		setFeedback(null);

		try {
			await agent.stub.addOption(normalizedOption);
			setNewOption("");
			setFeedback({ type: "success", message: "선택지가 추가됐습니다." });
		} catch (error) {
			setFeedback({ type: "error", message: getErrorMessage(error) });
		} finally {
			setIsAddingOption(false);
		}
	}

	async function handleReset() {
		if (!window.confirm("득표 수와 마감 시간을 초기화할까요?")) return;

		setIsResetting(true);
		setFeedback(null);

		try {
			await agent.stub.reset();
			setFeedback({ type: "success", message: "투표가 초기화됐습니다." });
		} catch (error) {
			setFeedback({ type: "error", message: getErrorMessage(error) });
		} finally {
			setIsResetting(false);
		}
	}

	const statusLabel = {
		connecting: "연결 중",
		connected: "연결됨",
		disconnected: "연결 끊김",
	}[connectionStatus];

	return (
		<main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
			<section className="mx-auto w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/30 sm:p-8">
				<div className="flex items-center justify-between gap-4">
					<div>
						<p className="text-xs font-semibold tracking-[0.18em] text-cyan-400 uppercase">Live Poll</p>
						<h1 className="mt-2 text-2xl font-bold">{agent.name}</h1>
					</div>
					<span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
						<span
							className={`size-2 rounded-full ${connectionStatus === "connected" ? "bg-emerald-400" : connectionStatus === "connecting" ? "bg-amber-400" : "bg-red-400"}`}
						/>
						{statusLabel}
					</span>
				</div>

				{connectionStatus === "connected" && pollState ? (
					<>
						<div className="mt-7 grid gap-3 sm:grid-cols-3">
							<div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
								<p className="text-xs text-slate-500">총 투표</p>
								<p className="mt-1 text-2xl font-bold">{totalVotes}<span className="ml-1 text-sm font-medium text-slate-500">표</span></p>
							</div>
							<div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
								<p className="text-xs text-slate-500">남은 시간</p>
								<p className={`mt-1 text-2xl font-bold ${isClosed ? "text-red-300" : "text-cyan-300"}`}>
									{pollState.closesAt === null || now === 0 ? "--:--" : formatRemainingTime(pollState.closesAt - now)}
								</p>
							</div>
							<div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
								<p className="text-xs text-slate-500">상태</p>
								<p className={`mt-2 text-sm font-bold ${isClosed ? "text-red-300" : isPollActive ? "text-emerald-300" : "text-amber-300"}`}>
									{isClosed ? "마감됨" : isPollActive ? "투표 진행 중" : "투표 준비 중"}
								</p>
							</div>
						</div>

						<div className="mt-6">
							<p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">Question</p>
							<h2 className="mt-2 text-2xl font-bold leading-tight">
								{pollState.question || "어떤 선택지에 투표할까요?"}
							</h2>
							{access.readonly ? (
								<p className="mt-2 text-sm text-cyan-300">관전자 모드에서 실시간 결과를 보고 있습니다.</p>
							) : null}
						</div>

						<div className="mt-6 space-y-3">
							{pollState.options.length ? pollState.options.map((option) => {
								const percentage = totalVotes === 0 ? 0 : Math.round((option.votes / totalVotes) * 100);
								const votingThisOption = pendingOptionId === option.id;

								return (
									<button
										className="group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-left transition hover:border-cyan-400/40 disabled:cursor-not-allowed disabled:hover:border-white/10"
										disabled={access.readonly || !isPollActive || pendingOptionId !== null}
										key={option.id}
										onClick={() => handleVote(option.id)}
										type="button"
									>
										<span className="absolute inset-y-0 left-0 bg-cyan-400/10 transition-[width] duration-300" style={{ width: `${percentage}%` }} />
										<span className="relative flex items-center justify-between gap-4">
											<span className="font-semibold text-slate-200">{option.label}</span>
											<span className="shrink-0 text-sm text-slate-400">
												{votingThisOption ? "반영 중..." : `${option.votes}표 · ${percentage}%`}
											</span>
										</span>
									</button>
								);
							}) : (
								<p className="rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-slate-500">
									아직 등록된 선택지가 없습니다.
								</p>
							)}
						</div>

						{feedback ? (
							<p className={`mt-4 rounded-xl border px-4 py-3 text-sm ${feedback.type === "error" ? "border-red-400/20 bg-red-400/10 text-red-300" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"}`} role="status">
								{feedback.message}
							</p>
						) : null}

						{!access.readonly ? (
							<div className="mt-7 border-t border-white/10 pt-6">
								<form className="flex gap-2" onSubmit={handleAddOption}>
									<input
										className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
										disabled={isClosed || isAddingOption}
										onChange={(event) => setNewOption(event.target.value)}
										placeholder="새 선택지"
										value={newOption}
									/>
									<button
										className="rounded-xl bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
										disabled={isClosed || isAddingOption}
										type="submit"
									>
										{isAddingOption ? "추가 중" : "선택지 추가"}
									</button>
								</form>
								<button
									className="mt-3 w-full rounded-xl border border-red-400/20 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-400/10 disabled:opacity-50"
									disabled={isResetting}
									onClick={handleReset}
									type="button"
								>
									{isResetting ? "초기화 중..." : "투표 초기화"}
								</button>
							</div>
						) : null}
					</>
				) : (
					<div className="mt-7 rounded-xl border border-white/10 bg-slate-950/60 p-5 text-center">
						<p className="text-sm font-medium text-slate-200">
							{connectionStatus === "connecting" ? "투표 상태를 불러오는 중입니다..." : "연결이 끊겼습니다."}
						</p>
						{connectionStatus === "disconnected" ? (
							<p className="mt-2 text-xs text-red-300">토큰이 유효한지 확인한 뒤 다시 입장해주세요.</p>
						) : null}
					</div>
				)}

				<button
					className="mt-7 w-full rounded-xl border border-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white/5"
					onClick={onLeave}
					type="button"
				>
					연결 종료하고 나가기
				</button>
			</section>
		</main>
	);
}

function App() {
	const [roomAccess, setRoomAccess] = useState<RoomAccess | null>(null);
	const [screen, setScreen] = useState<"create" | "room" | null>(null);

	function leaveRoom() {
		setScreen(null);
		setRoomAccess(null);
	}

	function createPoll(access: RoomAccess) {
		setRoomAccess(access);
		setScreen("create");
	}

	function joinPoll(access: RoomAccess) {
		setRoomAccess(access);
		setScreen("room");
	}

	if (roomAccess && screen === "room") {
		return <VoteRoomConnection access={roomAccess} onLeave={leaveRoom} />;
	}

	return roomAccess && screen === "create" ? (
		<RoomReady
			access={roomAccess}
			onConnect={() => setScreen("room")}
			onLeave={leaveRoom}
		/>
	) : (
		<JoinRoomForm onCreate={createPoll} onJoin={joinPoll} />
	);
}

export default App;
