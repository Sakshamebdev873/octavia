import Link from "next/link";

export default function NotFound() {
  return (
    <div className="state state-error">
      <h2>Page not found</h2>
      <p>There is nothing at this address.</p>
      <Link className="button" href="/flows">
        Back to flows
      </Link>
    </div>
  );
}
