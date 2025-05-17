import React from "react";
import useTeaQualitiesList from "@/api/useTeaQualitiesList/useTeaQualitiesList.ts";
import capitalize from "lodash/capitalize";
import Tag from "@/components/shared/Tag/Tag.tsx";
import { getDefaultColorByIndex } from "@/lib/colors.ts";

const TeaQualitiesPage = () => {
  const { data: teaQualities } = useTeaQualitiesList();

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tea Qualities</h1>
        <p className="mt-2 text-gray-600">
          A comprehensive list of qualities used to evaluate teas in our collection.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teaQualities?.map((quality, idx) => (
          <div
            key={quality.id}
            className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 hover:border-primary-light transition-all duration-200"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {capitalize(quality.name)}
            </h2>
            <div className="flex flex-wrap gap-2">
              {quality.possibleValues.map((value, valueIdx) => (
                <Tag key={value} color={getDefaultColorByIndex(valueIdx)}>
                  {value}
                </Tag>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TeaQualitiesPage;
