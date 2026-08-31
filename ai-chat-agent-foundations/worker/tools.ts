import { tool } from "ai";
import z from "zod";

export const getWeather = tool({
    title: "GetWeather",
    description: "Get weather for a city",
    inputSchema: z.object({
        city: z.string().meta({description: "The name of the city you want to get the weather from (ie: Malaga)",}),
    }),
    execute:  ({city}) => {
        return `The weather in the ${city} is sunny`
    }
});