import React from "react";
import useTeaQualitiesList from "@/api/useTeaQualitiesList/useTeaQualitiesList.ts";
import { Button } from "@/components/ui/button.tsx";
import capitalize from "lodash/capitalize";

const TeaQualitiesPage = () => {
  const { data: teaQualities } = useTeaQualitiesList();

  return (
    <div className="pt-10">
      <h1>Tea qualities</h1>

      <div>
        <div>
          <div className="flex flex-col">
            {teaQualities?.map((t, idx) => (
              <div key={t.id}>
                {capitalize(t.name)}

                <div>
                  {t.possibleValues.map((pv) => (
                    <span key={pv}>{pv}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeaQualitiesPage;
