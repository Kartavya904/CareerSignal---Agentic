/**
 * One-off script to inspect profiles table and find why parsed data isn't persisting.
 * Run: node scripts/check-profiles.mjs
 */
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:Kart%401710@localhost:5433/careersignal';

async function main() {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to DB\n');

    // 1. Table structure
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'profiles'
      ORDER BY ordinal_position
    `);
    console.log('=== profiles columns ===');
    cols.rows.forEach((r) => console.log(r.column_name, r.data_type, r.is_nullable));

    // 2. Row count and sample
    const count = await client.query('SELECT COUNT(*) FROM profiles');
    console.log('\n=== Row count ===', count.rows[0].count);

    const rows = await client.query(`
      SELECT id, user_id, name, location, work_authorization,
             resume_parsed_at, created_at, updated_at,
             jsonb_typeof(experience) as exp_type,
             jsonb_array_length(COALESCE(experience, '[]'::jsonb)) as exp_len,
             jsonb_array_length(COALESCE(projects, '[]'::jsonb)) as proj_len,
             length(COALESCE(resume_raw_text,'')) as raw_text_len
      FROM profiles
      LIMIT 5
    `);
    console.log('\n=== Sample rows ===');
    console.log(JSON.stringify(rows.rows, null, 2));

    // 3. Check for triggers or constraints that could block update
    const triggers = await client.query(`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'profiles'
    `);
    console.log('\n=== Triggers on profiles ===', triggers.rows.length ? triggers.rows : 'none');

    // 4. No test update - just report current state
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Full:', err);
  } finally {
    await client.end();
  }
}

main();
