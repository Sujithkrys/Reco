import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://aczpibbgrksqclnowzin.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFub24iLCJpYXQiOjE3ODk1NzI3MzMsImV4cCI6MjEwNTE0ODczM30.KvComI-ar0YwkDJRXMX6fjZiQHXKWckmHg3QPk71d8U'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
