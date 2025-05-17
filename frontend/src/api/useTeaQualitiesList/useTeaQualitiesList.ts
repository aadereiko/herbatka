import { useQuery } from "@tanstack/react-query";
import api from "@/api/api.ts";
import { TeaQuality } from "@/components/types/teaQuality.ts";

interface ServerTeaQuality {
  name: string;
  possible_values: (string | number)[];
}

const transformTeaQuality = (serverT: ServerTeaQuality) => {
  return {
    name: serverT.name,
    possibleValues: serverT.possible_values,
  } as TeaQuality;
};

const getTeaQualities = async () => {
  const response = await api.get("tea-qualities");

  return response.data.map(transformTeaQuality) as TeaQuality[];
};

const useTeaQualitiesList = () => {
  return useQuery({
    queryKey: ["tea-qualities"],
    queryFn: () => getTeaQualities(),
  });
};

export default useTeaQualitiesList;
