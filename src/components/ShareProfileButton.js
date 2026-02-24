"use client";

export default function ShareProfileButton({ username }) {
  const handleClick = () => {
    const url = `${window.location.origin}/u/${username}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <button
      className="profile-share-btn"
      onClick={handleClick}
    >
      Copy Profile Link
    </button>
  );
}