import { Link } from 'react-router-dom';
export function NotFoundPage() {
  return (
    <div className="page-head">
      <h1>Not found</h1>
      <Link className="btn primary" to="/space">Back to space</Link>
    </div>
  );
}
