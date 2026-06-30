"use client";
import { useState } from "react";
import Feed from "@/components/Feed";
import ApiList from "@/components/ApiList";

const CHIPS = ["Все", "Видеоигры", "Музыка", "Технологии", "Наука", "Новости", "Спорт", "Фильмы", "Подкасты"];

export default function HomePage() {
  const [chip, setChip] = useState("Все");
  return (
    <>
      <div className="chips">
        {CHIPS.map((c) => (
          <div key={c} className={`chip${c === chip ? " active" : ""}`} onClick={() => setChip(c)}>{c}</div>
        ))}
      </div>
      {chip === "Все" ? <Feed /> : <ApiList key={chip} url={`/api/search?q=${encodeURIComponent(chip)}`} />}
    </>
  );
}
