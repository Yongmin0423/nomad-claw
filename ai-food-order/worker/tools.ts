import { tool } from "ai";
import { z } from "zod";

export const MENU_ITEMS = [
  {
    id: "KIMCHI_STEW",
    name: "김치찌개",
    price: 10_000,
    available: true,
    allergens: ["pork", "soybean", "wheat"],
    spicyLevel: "medium",
    description: "한국인의 소울푸드, 깊은 맛의 김치찌개",
  },
  {
    id: "BEEF_BOWL",
    name: "소고기 덮밥",
    price: 12_000,
    available: true,
    allergens: ["beef", "soybean", "wheat"],
    spicyLevel: "low",
    description: "부드러운 소고기와 특제 소스의 조화",
  },
  {
    id: "JAJANGMYEON",
    name: "짜장면",
    price: 8_000,
    available: true,
    allergens: ["wheat", "soybean", "pork"],
    spicyLevel: "low",
    description: "고전적인 중화요리, 달콤한 춘장의 맛",
  },
  {
    id: "TANGSUYUK",
    name: "탕수육",
    price: 15_000,
    available: true,
    allergens: ["wheat", "soybean"],
    spicyLevel: "low",
    description: "바삭한 튀김옷과 새콤달콤한 소스",
  },
  {
    id: "SEAFOOD_NOODLES",
    name: "해물라면",
    price: 13_000,
    available: true,
    allergens: ["wheat", "shellfish"],
    spicyLevel: "medium",
    description: "신선한 해물이 듬뿍 들어간 얼큰한 라면",
  },
  {
    id: "GYERANMARI",
    name: "계란말이",
    price: 7_000,
    available: true,
    allergens: ["egg", "wheat"],
    spicyLevel: "low",
    description: "부드럽고 폭신한 계란말이",
  },
  {
    id: "BULGOGI",
    name: "불고기",
    price: 18_000,
    available: true,
    allergens: ["beef", "soybean", "wheat"],
    spicyLevel: "low",
    description: "달콤 짭짤한 특제 양념에 재운 한국 전통 소불고기",
  },
  {
    id: "DDUKBOKKI",
    name: "떡볶이",
    price: 8_000,
    available: true,
    allergens: ["wheat", "fish"],
    spicyLevel: "high",
    description: "매콤달콤 쫄깃한 쌀떡볶이",
  },
  {
    id: "JUKSUN",
    name: "죽순 볶음",
    price: 12_000,
    available: false,
    allergens: ["soybean", "sesame"],
    spicyLevel: "low",
    description: "아삭한 죽순을 볶은 요리 (품절)",
  },
] as const;

export const STORES = [
  {
    id: "GANGNAM",
    name: "강남점",
    latitude: 37.4979,
    longitude: 127.0276,
  },
  {
    id: "HONGDAE",
    name: "홍대점",
    latitude: 37.5563,
    longitude: 126.9236,
  },
  {
    id: "JONGNO",
    name: "종로점",
    latitude: 37.5704,
    longitude: 126.9922,
  },
] as const;

const storeIds = ["GANGNAM", "HONGDAE", "JONGNO"] as const;

export type CartLine = {
  itemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

export type OrderSummary = {
  id: string;
  items: CartLine[];
  total: number;
  fulfillment:
    | { type: "pickup"; storeId: (typeof storeIds)[number] }
    | {
        type: "delivery";
        storeId: (typeof storeIds)[number];
        latitude: number;
        longitude: number;
        addressLabel?: string;
      };
  placedAt: string;
};

export type OrderState = {
  cart: CartLine[];
  orderStatus: "shopping" | "placed";
  lastOrder?: OrderSummary;
};

export type CartSummary = {
  currency: "KRW";
  items: Array<CartLine & { lineTotal: number }>;
  totalQuantity: number;
  total: number;
};

type OrderStateAccess = {
  getState: () => OrderState;
  setState: (state: OrderState) => void;
};

export function createInitialOrderState(): OrderState {
  return {
    cart: [],
    orderStatus: "shopping",
  };
}

export function summarizeCart(cart: CartLine[]): CartSummary {
  const items = cart.map((item) => ({
    ...item,
    lineTotal: item.unitPrice * item.quantity,
  }));

  return {
    currency: "KRW",
    items,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    total: items.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}

export function createOrderTools(stateAccess: OrderStateAccess) {
  const getMenu = tool({
    title: "Get menu",
    description:
      "현재 주문 가능한 메뉴와 매장 목록을 조회합니다. 주문 전 상품 ID와 품절 여부를 확인할 때 사용합니다.",
    inputSchema: z.object({}),
    execute: async () => ({
      currency: "KRW" as const,
      items: MENU_ITEMS,
      stores: STORES,
    }),
  });

  const addToCart = tool({
    title: "Add item to cart",
    description:
      "getMenu에서 확인한 상품을 장바구니에 추가합니다. 가격이 아니라 정확한 상품 ID와 수량을 전달합니다.",
    inputSchema: z.object({
      item: z.object({
        id: z.string().min(1).describe("getMenu가 반환한 상품 ID"),
        quantity: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(1)
          .describe("추가할 수량"),
      }),
    }),
    execute: async ({ item }) => {
      const menuItem = MENU_ITEMS.find((candidate) => candidate.id === item.id);

      if (!menuItem) {
        return { success: false, error: "존재하지 않는 메뉴입니다." };
      }

      if (!menuItem.available) {
        return { success: false, error: `${menuItem.name}은(는) 품절입니다.` };
      }

      const currentState = stateAccess.getState();
      const existingLine = currentState.cart.find(
        (line) => line.itemId === menuItem.id,
      );
      const nextQuantity = (existingLine?.quantity ?? 0) + item.quantity;

      if (nextQuantity > 20) {
        return {
          success: false,
          error: "한 상품은 장바구니에 최대 20개까지 담을 수 있습니다.",
        };
      }

      const nextLine: CartLine = {
        itemId: menuItem.id,
        name: menuItem.name,
        unitPrice: menuItem.price,
        quantity: nextQuantity,
      };
      const nextCart = existingLine
        ? currentState.cart.map((line) =>
            line.itemId === menuItem.id ? nextLine : line,
          )
        : [...currentState.cart, nextLine];

      stateAccess.setState({
        ...currentState,
        cart: nextCart,
        orderStatus: "shopping",
      });

      return {
        success: true,
        added: {
          itemId: menuItem.id,
          name: menuItem.name,
          quantity: item.quantity,
        },
        cart: summarizeCart(nextCart),
      };
    },
  });

  const viewCart = tool({
    title: "View cart",
    description: "현재 장바구니 항목, 수량, 상품별 금액과 총액을 조회합니다.",
    inputSchema: z.object({}),
    execute: async () => summarizeCart(stateAccess.getState().cart),
  });

  const getLocation = tool({
    title: "Get browser location",
    description:
      "사용자의 현재 좌표를 브라우저에서 가져옵니다. 가까운 매장을 선택하거나 배달 위치를 정할 때 사용합니다.",
    inputSchema: z.object({}),
  });

  const placeOrder = tool({
    title: "Place order",
    description:
      "현재 장바구니 주문을 확정합니다. 반드시 viewCart로 총액을 확인하고 사용자 승인을 받은 뒤 실행합니다.",
    inputSchema: z.object({
      fulfillment: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("pickup"),
          storeId: z.enum(storeIds),
        }),
        z.object({
          type: z.literal("delivery"),
          storeId: z.enum(storeIds),
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          addressLabel: z.string().min(1).max(200).optional(),
        }),
      ]),
    }),
    needsApproval: true,
    execute: async ({ fulfillment }) => {
      const currentState = stateAccess.getState();
      const cart = summarizeCart(currentState.cart);

      if (cart.items.length === 0) {
        return { success: false, error: "장바구니가 비어 있습니다." };
      }

      const order: OrderSummary = {
        id: crypto.randomUUID(),
        items: currentState.cart,
        total: cart.total,
        fulfillment,
        placedAt: new Date().toISOString(),
      };

      stateAccess.setState({
        cart: [],
        orderStatus: "placed",
        lastOrder: order,
      });

      return {
        success: true,
        order,
        message: "주문이 승인되어 정상적으로 접수되었습니다.",
      };
    },
  });

  return { getMenu, addToCart, viewCart, getLocation, placeOrder };
}
