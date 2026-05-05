// src/components/Conversations.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Conversations({ onSelect }: any) {
  const [list, setList] = useState<any[]>([]);

  useEffect(() => {
    api.get("/conversations").then((res) => {
      setList(res.data);
    });
  }, []);

  return (
    <div className="w-64 border-r border-gray-700">
      {list.map((c) => (
        <div
          key={c.user_id}
          onClick={() => onSelect(c.user_id)}
          className="p-3 cursor-pointer hover:bg-gray-800"
        >
          <div>{c.display_name}</div>
          <div className="text-xs text-gray-400">{c.username}</div>
        </div>
      ))}
    </div>
  );
}