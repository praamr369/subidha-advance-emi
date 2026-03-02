export default function UnauthorizedPage() {
  return (
    <div style={{ padding: "40px" }}>
      <h1>Unauthorized</h1>
      <p>You are not allowed to access this page.</p>
      <a href="/login">Go to Login</a>
    </div>
  );
}