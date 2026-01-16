import { useState, useEffect } from 'react';
import { initDB } from './db';
import { v4 as uuidv4 } from 'uuid';
import './App.css'


function App() {
  const [db, setDb] = useState(null);
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState('');

  // Initialize DB on load
  useEffect(() => {
    initDB().then(setDb);
  }, []);

  // Subscribe to changes
  useEffect(() => {
    if (!db) return;
    const sub = db.todos.find({
        sort: [{ updatedAt: 'desc' }]
    }).$.subscribe(setTodos);

    return () => sub.unsubscribe();
  }, [db]);

  const addTodo = async () => {
    if (!text) return;
    await db.todos.insert({
      id: uuidv4(),
      text,
      isDone: false,
      updatedAt: Date.now()
    });
    setText('');
  };

  const toggleTodo = async (todo) => {
    await todo.patch({ 
        isDone: !todo.isDone,
        updatedAt: Date.now() // Critical: Update timestamp to trigger sync
    });
  };

  if (!db) return <div>Loading Database...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Local-First Todo App</h2>
      <input 
        value={text} 
        onChange={e => setText(e.target.value)} 
        placeholder="Add a task"
      />
      <button onClick={addTodo}>Add</button>

      <ul>
        {todos.map(todo => (
          <li key={todo.id} style={{ textDecoration: todo.isDone ? 'line-through' : 'none' }}>
            <span onClick={() => toggleTodo(todo)} style={{ cursor: 'pointer' }}>
              {todo.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;