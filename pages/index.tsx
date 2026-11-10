import { useEffect, useState } from 'react'

import { supabase } from '../utils/supabase'

type Todo = {
  id: number | string
  name: string | null
}

export default function Page() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function getTodos() {
      const { data, error: queryError } = await supabase
        .from('todos')
        .select('id, name')

      if (!active) return

      if (queryError) {
        setError(queryError.message)
      } else {
        setTodos(data ?? [])
      }

      setLoading(false)
    }

    getTodos()

    return () => {
      active = false
    }
  }, [])

  if (loading) return <p>Loading todos...</p>
  if (error) return <p role="alert">Unable to load todos: {error}</p>

  return (
    <main>
      <h1>Todos</h1>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.name}</li>
        ))}
      </ul>
    </main>
  )
}
