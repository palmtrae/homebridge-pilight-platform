export enum State {
  Ready = 1,
  Busy,
  Cancelling,
  Cancelled,
}

export class OperationQueue {
  private jobs: { (): void }[] = []
  private state: State = State.Ready
  private onCancel: { (): void }[] = []

  public push(job: () => void) {
    this.jobs.push(job)
    if (this.state === State.Ready) {
      this.drain()
    }
  }

  public cancel(callback?: () => void) {
    if (this.state === State.Ready || this.state === State.Cancelled) {
      this.state = State.Cancelled
      callback && setTimeout(callback, 0)
    } else if (this.state === State.Busy) {
      this.state = State.Cancelling
    }
    callback && this.onCancel.push(callback)
  }

  public reset(callback?: () => void) {
    this.cancel(() => {
      this.jobs = []
      this.state = State.Ready
      callback && setTimeout(callback, 0)
    })
  }

  private async drain() {
    if (this.state === State.Busy) {
      return
    }

    this.state = State.Busy
    await this.next()
  }

  private async next() {
    const op = this.jobs.shift()
    if (op) {
      await op()
      if (this.state === State.Cancelling) {
        this.state = State.Cancelled
        this.onCancel.forEach((cancel) => {
          cancel()
        })
      } else if (this.jobs.length > 0) {
        await this.next()
      }
    }
    this.state = State.Ready
  }
}
