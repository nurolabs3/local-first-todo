import { useState } from 'react';
import { useAuth } from './AuthContext';
import './Auth.css';

export const AuthScreen = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, register, loading, error } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (isLogin) {
                await login(email, password);
            } else {
                await register(email, password);
            }
            // Success - AuthContext will update and App will re-render
        } catch (err) {
            // Error is already set in AuthContext
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h1>{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
                <p className="auth-subtitle">
                    {isLogin 
                        ? 'Sign in to access your tasks' 
                        : 'Start managing your tasks today'}
                </p>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            minLength={6}
                            autoComplete={isLogin ? "current-password" : "new-password"}
                        />
                        {!isLogin && (
                            <small>Minimum 6 characters</small>
                        )}
                    </div>

                    {error && (
                        <div className="error-message">
                            {error}
                        </div>
                    )}

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
                    </button>
                </form>

                <div className="auth-toggle">
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button 
                        type="button"
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setEmail('');
                            setPassword('');
                        }}
                        className="btn-link"
                    >
                        {isLogin ? 'Sign up' : 'Sign in'}
                    </button>
                </div>
            </div>
        </div>
    );
};
