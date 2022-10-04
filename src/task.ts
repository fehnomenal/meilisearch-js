import { MeiliSearchTimeOutError } from './errors'
import {
  Config,
  WaitOptions,
  TaskStatus,
  TasksQuery,
  TasksResults,
  TaskObject,
  TasksResultsObject,
} from './types'
import { HttpRequests } from './http-requests'
import { removeUndefinedFromObject, sleep } from './utils'

class Task {
  indexUid: TaskObject['indexUid']
  status: TaskObject['status']
  type: TaskObject['type']
  uid: TaskObject['uid']
  batchUid: TaskObject['batchUid']
  details: TaskObject['details']
  error: TaskObject['error']
  duration: TaskObject['duration']
  startedAt: Date
  enqueuedAt: Date
  finishedAt: Date

  constructor(task: TaskObject) {
    this.indexUid = task.indexUid
    this.status = task.status
    this.type = task.type
    this.uid = task.uid
    this.batchUid = task.batchUid
    this.details = task.details
    this.error = task.error
    this.duration = task.duration

    this.startedAt = new Date(task.startedAt)
    this.enqueuedAt = new Date(task.enqueuedAt)
    this.finishedAt = new Date(task.finishedAt)
  }
}

class TaskClient {
  httpRequest: HttpRequests

  constructor(config: Config) {
    this.httpRequest = new HttpRequests(config)
  }

  /**
   * Get one task
   *
   * @param  {number} uid - unique identifier of the task
   *
   * @returns { Promise<Task> }
   */
  async getTask(uid: number): Promise<Task> {
    const url = `tasks/${uid}`
    const taskItem = await this.httpRequest.get<TaskObject>(url)
    return new Task(taskItem)
  }

  /**
   * Get tasks
   *
   * @param  {TasksQuery} [parameters={}] - Parameters to browse the tasks
   *
   * @returns {Promise<TasksResults>} - Promise containing all tasks
   */
  async getTasks(parameters: TasksQuery = {}): Promise<TasksResults> {
    const url = `tasks`

    const queryParams = {
      indexUid: parameters?.indexUid?.join(','),
      type: parameters?.type?.join(','),
      status: parameters?.status?.join(','),
      from: parameters.from,
      limit: parameters.limit,
    }

    const tasks = await this.httpRequest.get<Promise<TasksResultsObject>>(
      url,
      removeUndefinedFromObject(queryParams)
    )

    return {
      ...tasks,
      results: tasks.results.map((task) => new Task(task)),
    }
  }

  /**
   * Wait for a task to be processed.
   *
   * @param {number} taskUid Task identifier
   * @param {WaitOptions} options Additional configuration options
   *
   * @returns {Promise<Task>} Promise returning a task after it has been processed
   */
  async waitForTask(
    taskUid: number,
    { timeOutMs = 5000, intervalMs = 50 }: WaitOptions = {}
  ): Promise<Task> {
    const startingTime = Date.now()
    while (Date.now() - startingTime < timeOutMs) {
      const response = await this.getTask(taskUid)
      if (
        ![TaskStatus.TASK_ENQUEUED, TaskStatus.TASK_PROCESSING].includes(
          response.status
        )
      )
        return response
      await sleep(intervalMs)
    }
    throw new MeiliSearchTimeOutError(
      `timeout of ${timeOutMs}ms has exceeded on process ${taskUid} when waiting a task to be resolved.`
    )
  }

  /**
   * Waits for multiple tasks to be processed
   *
   * @param {number[]} taskUids Tasks identifier list
   * @param {WaitOptions} options Wait options
   *
   * @returns {Promise<Task[]>} Promise returning a list of tasks after they have been processed
   */
  async waitForTasks(
    taskUids: number[],
    { timeOutMs = 5000, intervalMs = 50 }: WaitOptions = {}
  ): Promise<Task[]> {
    const tasks: Task[] = []
    for (const taskUid of taskUids) {
      const task = await this.waitForTask(taskUid, {
        timeOutMs,
        intervalMs,
      })
      tasks.push(task)
    }
    return tasks
  }
}

export { TaskClient, Task }