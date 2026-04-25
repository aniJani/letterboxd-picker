import { http, HttpResponse } from "msw";

export const handlers = [
  http.all("*", ({ request }) => {
    return HttpResponse.json({ unhandled: request.url }, { status: 599 });
  }),
];
