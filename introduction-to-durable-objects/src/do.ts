import { DurableObject } from "cloudflare:workers";

export class DurablePotato extends DurableObject<Env> {
    // cloudflare의 청사진 같은 역할
	// 아무 동작 하지 않으면 idle상태로 변하는데, 그 이후에 일정 시간 아무 동작이 없으면 hibernate 된다.
	// hibernate된 상태에서도 cold start 없이 바로 깨어난다.
	sql: SqlStorage;
	constructor(ctx:DurableObjectState,env: Env) {
		super(ctx, env);

		this.sql = ctx.storage.sql;

		const res = this.sql.exec(`
			CREATE TABLE IF NOT EXISTS pongs (
			 id INTEGER PRIMARY KEY AUTOINCREMENT,
			 total INTEGER
			)
			`);

			ctx.storage.sql.exec(`
				INSERT OR IGNORE INTO pongs (id, total) VALUES (1, 0);
				`)
	};

	async increase() {
		const {total} = this.sql.exec('UPDATE pongs SET total = total + 1 WHERE id = 1 RETURNING total').one() as {total: number};
		
		if(total >= 30) {
			const currentAlarm = await this.ctx.storage.getAlarm();

			if(currentAlarm === null) {
				 this.ctx.storage.setAlarm(Date.now() + 10 * 1000);
			}
		}
		return `count is ${total}`;
	}
	
	alarm() {
		this.sql.exec('UPDATE pongs SET total = 0 WHERE id = 1');
		// search in your alarms table and find the next alarm
		// schedule the next alarm	
		// 이렇게 하는 이유는 durable object는 각 하나의 알람밖에 가질 수 없다.
	}
}  