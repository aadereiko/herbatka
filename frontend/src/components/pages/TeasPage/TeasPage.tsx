import React from "react";
import useTeasList from "@/api/useTeasList/useTeasList.ts";
import TeaItem from "@/components/pages/TeasPage/TeaItem.tsx";

const TeasPage = () => {
  const { data: teas } = useTeasList();

  return (
    <div className="pt-10">
      <h1>Teas</h1>

      <div>{teas?.map((t) => <TeaItem key={t.id} {...t} />)}</div>
    </div>
  );
};

export default TeasPage;
