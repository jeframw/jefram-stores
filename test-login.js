fetch('http://localhost:3000/api/auth/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'Jeframstore@gmail.com', password: 'testpassword' })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);