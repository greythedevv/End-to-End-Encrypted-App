// src/components/UserSearch.tsx
import { useState } from "react";
import { api } from "../lib/api";

export default function UserSearch({ onSelect }: any) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);

  const search = async (q: string) => {
    setQuery(q);
    if (!q) return setResults([]);

    const res = await api.get(`/users/search?q=${q}`);
    setResults(res.data);
  };

  return (
    <div className="p-2 border-b border-gray-700">
      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Search users..."
        className="w-full p-2 bg-gray-800 rounded"
      />

      {results.map((u) => (
        <div
          key={u.id}
          onClick={() => onSelect(u.id)}
          className="p-2 hover:bg-gray-800 cursor-pointer"
        >
          {u.display_name}
        </div>
      ))}
    </div>
  );
}