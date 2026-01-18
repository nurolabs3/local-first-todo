import { useState, useEffect } from 'react';
import { initDB } from './db';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './AuthContext';
import { AuthScreen } from './AuthScreen';
import './App.css';

function App() {
  const { isAuthenticated, user, token, logout } = useAuth();
  const [db, setDb] = useState(null);
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!isAuthenticated || !user || !token) {
      setDb(null);
      return;
    }
    
    initDB(user.id, token)
      .then(setDb)
      .catch(err => console.error('Failed to initialize database:', err));
  }, [isAuthenticated, user, token]);

  useEffect(() => {
    if (!db) return;
    const sub = db.todos.find({
      sort: [{ updatedAt: 'desc' }]
    }).$.subscribe(setTodos);
    return () => sub.unsubscribe();
  }, [db]);

  const addTodo = async () => {
    if (!text.trim()) return;
    await db.todos.insert({
      id: uuidv4(),
      userId: user.id,
      text,
      isDone: false,
      updatedAt: Date.now()
    });
    setText('');
  };

  const toggleTodo = async (todo) => {
    await todo.patch({ 
      isDone: !todo.isDone,
      updatedAt: Date.now()
    });
  };

  const handleLogout = async () => {
    await logout(db);
    setDb(null);
    setTodos([]);
  };

  if (!isAuthenticated) return <AuthScreen />;

  if (!db) {
    return (
      <div className="loading-screen">
        <h2>Loading your tasks...</h2>
        <p>Please wait</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="app-header">
        <div>
          <h2>My Tasks</h2>
          <p className="user-info">{user.email}</p>
        </div>
        <button onClick={handleLogout} className="btn-logout">
          Logout
        </button>
      </div>
      
      <div className="add-todo-section">
        <div className="add-todo-form">
          <input 
            value={text} 
            onChange={e => setText(e.target.value)} 
            onKeyPress={e => e.key === 'Enter' && addTodo()}
            placeholder="What needs to be done?"
          />
          <button onClick={addTodo} className="btn-add">
            Add
          </button>
        </div>
      </div>

      <div className="todos-list">
        {todos.length === 0 ? (
          <div className="empty-state">
            <p>No tasks yet. Add one above!</p>
          </div>
        ) : (
          todos.map(todo => (
            <div 
              key={todo.id} 
              className={`todo-item ${todo.isDone ? 'done' : ''}`}
              onClick={() => toggleTodo(todo)}
            >
              <span className="todo-text">{todo.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;