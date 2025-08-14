// Login functionality
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        
        const loginText = document.getElementById('loginText');
        const loginLoader = document.getElementById('loginLoader');
        const errorMessage = document.getElementById('errorMessage');
        
        // Show loading state
        if (loginText) loginText.style.display = 'none';
        if (loginLoader) loginLoader.style.display = 'block';
        if (errorMessage) errorMessage.style.display = 'none';
        
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Store tokens
                const storage = rememberMe ? localStorage : sessionStorage;
                storage.setItem('token', result.data.tokens.accessToken);
                storage.setItem('refreshToken', result.data.tokens.refreshToken);
                
                // Redirect to dashboard
                window.location.href = '/dashboard';
            } else {
                // Show error
                if (errorMessage) {
                    errorMessage.textContent = result.message;
                    errorMessage.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Login error:', error);
            if (errorMessage) {
                errorMessage.textContent = 'Login failed. Please try again.';
                errorMessage.style.display = 'block';
            }
        } finally {
            // Reset loading state
            if (loginText) loginText.style.display = 'block';
            if (loginLoader) loginLoader.style.display = 'none';
        }
    });

    // Auto-redirect if already logged in
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
        window.location.href = '/dashboard';
    }
});