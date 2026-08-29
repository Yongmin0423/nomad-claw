import { useAgent } from "agents/react"
import type { ChattingRoomAgent, ChattingRoomState } from "../worker";
import { useState } from "react";

function App() {
	const [isConnected, setIsConnected] = useState(false);
	const [message, setMessage] = useState(''); 
	//이걸로 서버랑 연결되서 웹소켓 연결이 되었는지, 끊어졌는지, 에러가 났는지 알 수 있다.'
	//useAgent는 Generics를 사용해서 어떤 에이전트를 사용할건지, 어떤 state를 사용할건지 알려준다.
	const agent  = useAgent<ChattingRoomAgent, ChattingRoomState>({
		agent: 'ChattingRoomAgent',
		onOpen: () => setIsConnected(true),
		// onStateUpdate: (state) => setPingPongs(state.pingPongCount),
		onClose: () => setIsConnected(false),
		onError: () => setIsConnected(false),
		onMessage: (event) => console.log(event),
	})

	const sendMessage = () => {
		setMessage('');	
	}

	if(!isConnected) return <h1>connecting....</h1>
	
	return <div>
		<h1>Chatting Room Agent</h1>
		<h3>Online ppl: {agent?.state?.currentlyOnline}</h3>
		<hr/>
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
