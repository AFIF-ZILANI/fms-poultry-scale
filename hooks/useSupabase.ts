// hooks/useSupabase.ts
import { useAuth } from '@clerk/expo'
import { makeSupabaseClient } from '../lib/supabase'
import { useMemo } from 'react'

export function useSupabase() {
  const { getToken } = useAuth()

  return useMemo(() => makeSupabaseClient(getToken), [getToken])
}