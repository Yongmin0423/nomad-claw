export const chatPage = `<!doctype html>
<html lang="ko">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Durable Object Chat</title>
	<style>
		* { box-sizing: border-box; }
		body { margin: 0; min-height: 100vh; background: #f4f4f5; color: #18181b; font-family: system-ui, sans-serif; }
		main { width: min(720px, calc(100% - 32px)); margin: 40px auto; }
		h1 { margin-bottom: 8px; }
		.panel { padding: 20px; border: 1px solid #d4d4d8; border-radius: 16px; background: white; box-shadow: 0 10px 30px rgb(0 0 0 / 6%); }
		.row { display: flex; gap: 8px; margin-bottom: 12px; }
		input, button { min-height: 42px; border-radius: 10px; font: inherit; }
		input { min-width: 0; flex: 1; padding: 0 12px; border: 1px solid #d4d4d8; }
		button { padding: 0 16px; border: 0; background: #18181b; color: white; cursor: pointer; }
		button:disabled { cursor: not-allowed; opacity: .5; }
		#status { min-height: 24px; margin: 0 0 12px; color: #52525b; }
		#messages { height: 360px; margin: 0 0 12px; padding: 12px 12px 12px 32px; overflow-y: auto; border-radius: 10px; background: #fafafa; }
		#messages li { margin: 6px 0; overflow-wrap: anywhere; }
		@media (max-width: 560px) { .room-row { flex-direction: column; } }
	</style>
</head>
<body>
	<main>
		<h1>Durable Object Chat</h1>
		<p>같은 room ID로 접속한 사용자끼리 대화합니다.</p>
		<section class="panel">
			<form id="connect-form" class="row room-row">
				<input id="room" value="public" aria-label="Room ID" placeholder="Room ID" required>
				<input id="nickname" value="guest" aria-label="Nickname" placeholder="Nickname" required>
				<button type="submit">연결</button>
			</form>
			<p id="status">연결 전</p>
			<ul id="messages" aria-live="polite"></ul>
			<form id="message-form" class="row">
				<input id="message" aria-label="Message" placeholder="메시지를 입력하세요" autocomplete="off" required>
				<button id="send" type="submit" disabled>전송</button>
			</form>
		</section>
	</main>
	<script>
		const connectForm = document.querySelector('#connect-form');
		const messageForm = document.querySelector('#message-form');
		const roomInput = document.querySelector('#room');
		const nicknameInput = document.querySelector('#nickname');
		const messageInput = document.querySelector('#message');
		const messages = document.querySelector('#messages');
		const status = document.querySelector('#status');
		const sendButton = document.querySelector('#send');
		let socket;

		function appendMessage(text) {
			const item = document.createElement('li');
			item.textContent = text;
			messages.append(item);
			messages.scrollTop = messages.scrollHeight;
		}

		async function loadHistory(roomId) {
			const response = await fetch('/message?roomId=' + encodeURIComponent(roomId));
			if (!response.ok) throw new Error('기록을 불러오지 못했습니다.');
			const history = await response.json();
			for (const entry of history) {
				appendMessage(entry.nickname + ': ' + entry.content + ' (' + entry.created_at + ' UTC)');
			}
		}

		async function connect() {
			const roomId = roomInput.value.trim() || 'public';
			const nickname = nicknameInput.value.trim() || 'ANON';
			if (socket) socket.close(1000, 'Reconnect');
			messages.replaceChildren();
			status.textContent = '연결 중...';
			sendButton.disabled = true;

			try {
				await loadHistory(roomId);
			} catch (error) {
				appendMessage(error instanceof Error ? error.message : String(error));
			}

			const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
			const params = new URLSearchParams({ roomId, nickname });
			socket = new WebSocket(protocol + '//' + location.host + '/ws?' + params);
			socket.addEventListener('open', () => {
				status.textContent = roomId + ' 방에 연결됨';
				sendButton.disabled = false;
				messageInput.focus();
			});
			socket.addEventListener('message', (event) => appendMessage(String(event.data)));
			socket.addEventListener('close', () => {
				status.textContent = '연결 종료';
				sendButton.disabled = true;
			});
			socket.addEventListener('error', () => {
				status.textContent = '연결 오류';
			});
		}

		connectForm.addEventListener('submit', (event) => {
			event.preventDefault();
			void connect();
		});
		messageForm.addEventListener('submit', (event) => {
			event.preventDefault();
			if (!socket || socket.readyState !== WebSocket.OPEN) return;
			const content = messageInput.value.trim();
			if (!content) return;
			socket.send(content);
			messageInput.value = '';
		});

		void connect();
	</script>
</body>
</html>`;
