export class NetworkService {
  constructor(onData, onError) {
    this.onData = onData;
    this.onError = onError;
    this.intervalId = null;
  }

  async fetchOnce(selectedHex) {
    try {
      const res = await fetch(`/api/aircraft?selected=${selectedHex || ""}&t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.details || data.error || "Unknown server error");
      }
      
      this.onData(data);
    } catch (err) {
      this.onError(err);
    }
  }

  start(getSelectedHex) {
    this.fetchOnce(getSelectedHex());
    this.intervalId = setInterval(() => {
      this.fetchOnce(getSelectedHex());
    }, 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
