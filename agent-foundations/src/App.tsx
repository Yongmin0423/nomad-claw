import { useAgent } from "agents/react"
import type { ChattingRoomAgent, ChattingRoomState } from "../worker";
import { useState } from "react";

type Message = {
	id: number, nickname: string, message:string, created_at: number
}

function App() {
	const [isConnected, setIsConnected] = useState(false);
	const [message, setMessage] = useState(''); 
	const [messages, setMessages] = useState<Message[]>([]);
	const [nickname, setNickname] = useState<string | null>(null);
	const [ready, setReady] = useState(false);
	
	//이걸로 서버랑 연결되서 웹소켓 연결이 되었는지, 끊어졌는지, 에러가 났는지 알 수 있다.'
	//useAgent는 Generics를 사용해서 어떤 에이전트를 사용할건지, 어떤 state를 사용할건지 알려준다.
	const agent  = useAgent<ChattingRoomAgent, ChattingRoomState>({
		agent: 'ChattingRoomAgent',
		query: {
			name: nickname
		},
		enabled: ready,
		onOpen: async() => {
			setIsConnected(true)
			const history = await agent?.stub.loadHistory() as Message[];
			setMessages(history);
		},
		// onStateUpdate: (state) => setPingPongs(state.pingPongCount),
		onClose: () => setIsConnected(false),
		onError: () => setIsConnected(false),
		onMessage: (event) => setMessages(prev => [...prev, JSON.parse(event.data)] as Message[]),
	})

	const sendMessage = () => {
		agent.send(message)
		setMessage('');	
	}

	const onConfirm = () => {
		setReady(true);
	}

	if(!isConnected) {return <div>
				<h1>who are you?</h1>
				<input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Type a nickname" autoFocus />
				<button onClick={onConfirm}>confirm</button>
			</div>}
	
	return <div>
		<h1>Chatting Room Agent</h1>
		<h3>Online ppl: {agent?.state?.currentlyOnline}</h3>
		<hr/>
		{messages.map((message) => (
			<div key={message.id}>
				<span>{message.nickname}: </span>
				<span>{message.message}</span>
			</div>
		))}
		<form onSubmit={(e) => {
			e.preventDefault();
			sendMessage();
		}}>
			<input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type a message..." autoFocus />
			<button type="submit">Send</button>

		</form>
	</div>;
}

export default App;
