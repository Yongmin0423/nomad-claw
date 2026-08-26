import { DurableObject } from "cloudflare:workers";

export type Visitor = {
	ip: string | null;
	city: string | null;
	country: string | null;
};

export class DurablePotato extends DurableObject<Env> {
    // cloudflare의 청사진 같은 역할
	// 아무 동작 하지 않으면 idle상태로 변하는데, 그 이후에 일정 시간 아무 동작이 없으면 hibernate 된다.
	// hibernate된 상태에서도 cold start 없이 바로 깨어난다.
	sql: SqlStorage;
	constructor(ctx:DurableObjectState,env: Env) {
		super(ctx, env);

		this.sql = ctx.storage.sql;

		const res = this.sql.exec(`
			CREATE TABLE IF NOT EXISTS counter (
			 id INTEGER PRIMARY KEY AUTOINCREMENT,
			 count INTEGER
			)
			`);

			ctx.storage.sql.exec(`
				INSERT OR IGNORE INTO counter (id, count) VALUES (1, 0);
				CREATE TABLE IF NOT EXISTS history (
				 id INTEGER PRIMARY KEY AUTOINCREMENT,
				 delta INTEGER NOT NULL,
				 count INTEGER NOT NULL,
				 ip TEXT,
				 city TEXT,
				 country TEXT,
				 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
				);
				`)
	};

	async increase(visitor: Visitor = {ip: null, city: null, country: null}) {
		const count = this.ctx.storage.transactionSync(() => {
			const {count} = this.sql.exec('UPDATE counter SET count = count + 1 WHERE id = 1 RETURNING count').one() as {count: number};

			this.sql.exec(
				'INSERT INTO history (delta, count, ip, city, country) VALUES (?, ?, ?, ?, ?)',
				1,
				count,
				visitor.ip,
				visitor.city,
				visitor.country,
			);

			return count;
		});

		return `count is ${count}`;
	}
}
