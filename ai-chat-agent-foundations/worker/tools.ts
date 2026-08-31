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

export const getLocation = tool({
    title: "getLocation",
    description: "Use this to get the user location",
    inputSchema: z.object({})
})

export const getTickets = tool({
  description: "Get plane tickets to a city",
  inputSchema: z.object({
    from: z
      .string()
      .meta({ description: "The code of the departure airport (ie. ICN)" }),
    to: z
      .string()
      .meta({ description: "The code of the arrival airport (ie. CNX)" }),
  }),
  execute: async ({ from, to }) => {
    return [
      {
        flight: "KE653",
        from,
        to,
        departure: "09:15",
        arrival: "13:40",
        price: "$342",
      },
      {
        flight: "TG659",
        from,
        to,
        departure: "14:30",
        arrival: "18:55",
        price: "$289",
      },
      {
        flight: "OZ741",
        from,
        to,
        departure: "23:50",
        arrival: "04:10+1",
        price: "$195",
      },
    ];
  },
});
export const buyPlaneTicket = tool({
    title: "BuyPlaneTicket",
    description: "Use this when the user ask you to buy a ticket",
    inputSchema: z.object({
        ticketCode: z.string().meta({description: "The Ticket code that you want to buy (ie: 1234)"}),
        price: z.number().meta({description: "The price of the ticket (ie: 1000)"}),
        destination: z.string().meta({ description: "Where do you want to go?",}),
        date: z.string().meta({ description: "When do you want to go?",}),
        passengerCount: z.number().meta({ description: "How many passengers?",}),
    }),
    needsApproval: ({price}) => price >1000,
    execute:  ({destination,date,passengerCount}) => {
        return `You have successfully bought ${passengerCount} tickets to ${destination} for ${date}`
    }
})