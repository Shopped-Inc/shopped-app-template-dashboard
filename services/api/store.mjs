import postgres from 'postgres'

const activity = [
  { item: 'Morning fulfillment wave', status: 'Complete', owner: 'Operations' },
  { item: 'Inventory exception review', status: 'In progress', owner: 'Merchandising' },
  { item: 'Carrier handoff', status: 'On track', owner: 'Logistics' },
]

function finiteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function toSummary(row) {
  if (!row) throw new Error('The dashboard state row is missing.')
  const refreshCount = finiteNumber(row.refresh_count)
  return {
    openWork: finiteNumber(row.open_work),
    completedToday: finiteNumber(row.completed_today),
    onTimeRate: finiteNumber(row.on_time_rate),
    refreshCount,
    updatedAt: new Date(row.updated_at).toISOString(),
    activity: [
      ...activity,
      {
        item: 'Dashboard refreshes',
        status: `${refreshCount} recorded`,
        owner: 'Managed Postgres',
      },
    ],
  }
}

export function createPostgresDashboardStore(databaseUrl) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required.')
  const sql = postgres(databaseUrl, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: 'require',
  })

  return {
    async initialize() {
      await sql`
        INSERT INTO dashboard_state (id)
        VALUES (1)
        ON CONFLICT (id) DO NOTHING
      `
    },

    async health() {
      await sql`SELECT 1 AS ok`
    },

    async getSummary() {
      const [row] = await sql`
        SELECT open_work, completed_today, on_time_rate, refresh_count, updated_at
        FROM dashboard_state
        WHERE id = 1
      `
      return toSummary(row)
    },

    async recordRefresh() {
      const [row] = await sql`
        UPDATE dashboard_state
        SET refresh_count = refresh_count + 1,
            updated_at = now()
        WHERE id = 1
        RETURNING open_work, completed_today, on_time_rate, refresh_count, updated_at
      `
      return toSummary(row)
    },

    async close() {
      await sql.end({ timeout: 5 })
    },
  }
}
