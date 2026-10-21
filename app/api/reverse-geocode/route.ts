import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const lat = Number(
    url.searchParams.get("lat")
  );

  const lon = Number(
    url.searchParams.get("lon")
  );

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return NextResponse.json(
      {
        error: "Invalid coordinates."
      },
      {
        status: 400
      }
    );
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(
        lon
      )}`,
      {
        headers: {
          "User-Agent":
            "PhoneTrackingWebsite/1.0"
        }
      }
    );

    if (!response.ok) {
      return NextResponse.json({
        address:
          "Address unavailable"
      });
    }

    const data =
      await response.json();

    return NextResponse.json({
      address:
        data.display_name ||
        "Address unavailable"
    });

  } catch {
    return NextResponse.json({
      address:
        "Address unavailable"
    });
  }
}
