import { Agent, callable, routeAgentRequest, type Connection, type WSMessage } from 'agents';

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

	onConnect(): void | Promise<void> {
		this.setState({
			currentlyOnline: this.state.currentlyOnline + 1
		})
	}

	onClose(): void | Promise<void> {
		this.setState({
			currentlyOnline: this.state.currentlyOnline - 1
		})	
	}

	onMessage(connection: Connection, message: WSMessage) {
		console.log(message);
		connection.send(message)
	}

	// onStateChanged(state: ChattingRoomState, source: Connection | 'server'): void {
	// 	console.log("new state", state);
	// 	console.log('who did it', source)
	// }
}

export default {
	async fetch(request, env) {
		// 프론트엔드와 웹소켓연결을 맺기 위한 함수
		const agentResponse = await routeAgentRequest(request, env);
		if (agentResponse) return agentResponse;
		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
