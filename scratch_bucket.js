import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://aczpibbgrksqclnowzin.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjenBpYmJncmtzcWNsbm93emluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTU3MjczMywiZXhwIjoyMTA1MTQ4NzMzfQ.Ruov-tKMG0Et-Tb26EUoxS-L3WPSqjxkT8nJmYZ1SMM'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  const { data, error } = await supabase.storage.createBucket('projects-media', {
    public: true
  })
  if (error) {
    if (error.message.includes('already exists') || error.statusCode === '409') {
        console.log('Bucket already exists.')
    } else {
        console.error('Failed to create bucket:', error)
    }
  } else {
    console.log('Bucket created:', data)
  }
}

run()
