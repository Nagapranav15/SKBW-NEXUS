import React, { useState } from 'react';
import { Box, Button, TextField, Typography, Paper } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const users = [
 
    { username: 'kalyan', password: '8999', role: 'Admin' },
  { username: 'testuser', password: 'test', role: 'Sales' },
];

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = () => {
    const matchedUser = users.find(
      (user) => user.username === username && user.password === password
    );

    if (matchedUser) {
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('username', matchedUser.username);
      localStorage.setItem('role', matchedUser.role);
      navigate('/dashboard');
    } else {
      alert('Invalid username or password');
    }
  };

  return (
    <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
      <Paper elevation={4} sx={{ padding: 4, width: 300 }}>
        <Typography variant="h6" gutterBottom>ERP Login</Typography>
        <TextField
          label="Username"
          variant="outlined"
          fullWidth
          margin="normal"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <TextField
          label="Password"
          variant="outlined"
          type="password"
          fullWidth
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button fullWidth variant="contained" onClick={handleLogin} sx={{ mt: 2 }}>
          Login
        </Button>
      </Paper>
    </Box>
  );
}