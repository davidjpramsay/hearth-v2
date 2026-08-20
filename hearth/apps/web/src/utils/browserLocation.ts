export function getPhoneCoordinates(): Promise<{ latitude: number; longitude: number }> {
  if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
    return Promise.reject(new Error('Location is not available in this browser.'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was not allowed. You can still search by suburb or postcode.'
            : 'This phone could not provide its location. Try the suburb search instead.';
        reject(new Error(message));
      },
      { enableHighAccuracy: false, maximumAge: 15 * 60_000, timeout: 10_000 },
    );
  });
}
