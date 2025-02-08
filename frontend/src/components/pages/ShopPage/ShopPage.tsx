import React from "react";
import { useParams } from "react-router-dom";

interface UrlParams {
  id: string;
}

const ShopPage = () => {
  const { id } = useParams<UrlParams>();
  return <div>{id}</div>;
};

export default ShopPage;
