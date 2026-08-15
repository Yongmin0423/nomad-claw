import { DurableObject } from "cloudflare:workers";

export class DurablePotato extends DurableObject<Env> {
    // cloudflare의 청사진 같은 역할
	ping() {
		return 'pong';
	}
}