import { DurableObject } from "cloudflare:workers";

export type Visitor = {
	ip: string | null;
	city: string | null;
	country: string | null;
};

type HistoryEntry = Visitor & {
	id: number;
	delta: number;
	count: number;
	created_at: string;
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

	async increment(visitor: Visitor = {ip: null, city: null, country: null}) {
		return this.change(1, visitor);
	}

	async decrement(visitor: Visitor = {ip: null, city: null, country: null}) {
		return this.change(-1, visitor);
	}

	async getCount() {
		const {count} = this.sql.exec('SELECT count FROM counter WHERE id = 1').one() as {count: number};

		return count;
	}

	async getHistory() {
		return this.sql.exec<HistoryEntry>(`
			SELECT id, delta, count, ip, city, country, created_at
			FROM history
			ORDER BY id DESC
			LIMIT 100
		`).toArray();
	}

	private change(delta: 1 | -1, visitor: Visitor) {
		const count = this.ctx.storage.transactionSync(() => {
			const {count} = this.sql.exec('UPDATE counter SET count = count + ? WHERE id = 1 RETURNING count', delta).one() as {count: number};

			this.sql.exec(
				'INSERT INTO history (delta, count, ip, city, country) VALUES (?, ?, ?, ?, ?)',
				delta,
				count,
				visitor.ip,
				visitor.city,
				visitor.country,
			);

			return count;
		});

		return count;
	}
}
