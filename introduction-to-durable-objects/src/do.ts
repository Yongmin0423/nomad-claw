import { DurableObject } from "cloudflare:workers";

export class DurablePotato extends DurableObject<Env> {
    // cloudflare의 청사진 같은 역할
	// 아무 동작 하지 않으면 idle상태로 변하는데, 그 이후에 일정 시간 아무 동작이 없으면 hibernate 된다.
	// hibernate된 상태에서도 cold start 없이 바로 깨어난다.

	constructor(ctx:DurableObjectState,env: Env) {
		super(ctx, env);
		console.log('do started!!');
		const res = ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS pongs (
			 id INTEGER PRIMARY KEY AUTOINCREMENT,
			 total INTEGER
			)
			`);

			ctx.storage.sql.exec(`
				INSERT OR IGNORE INTO pongs (id, total) VALUE (1, 0);
				`)
		console.log("res", res);
	}
	count = 0;
	increase() {
		this.count++;
		return `count is ${this.count}`
	}

}