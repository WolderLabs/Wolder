// using DurableTask.Core;
// using DurableTask.Emulator;
// using Wolder.Core.Files;
// using Wolder.Core.Pipeline.DurableTaskInterop;
//
// namespace Wolder.Core.Pipeline;
//
// public class GeneratorActivityPipeline : IDisposable
// {
//     private readonly TaskHubClient _taskHubClient;
//     private readonly TaskHubWorker _taskHubWorker;
//     private bool _isDisposed;
//
//     public event Action? Disposing;
//
//     public GeneratorActivityPipeline()
//     {
//         var orchestrationServiceAndClient = new LocalOrchestrationService();
//         _taskHubClient = new TaskHubClient(orchestrationServiceAndClient);
//         _taskHubWorker = new TaskHubWorker(orchestrationServiceAndClient);
//     }
//
//     public void AddActivity<TActivity>()
//     {
//         _taskHubWorker.AddTaskActivities(new ServiceProviderCreator<TaskActivity>(typeof(TActivity), se));
//     }
//     
//     public void AddOrchestration<TOrchestration>()
//     {
//         _taskHubWorker.AddTaskActivities(new ServiceProviderCreator<TaskOrchestration>(typeof(TOrchestration), se));
//     }
//     
//     public async Task RunAsync<TOrchestration>()
//     {
//         var instance = await _taskHubClient.CreateOrchestrationInstanceAsync(
//             typeof(TOrchestration), "root", null);
//         Console.WriteLine("Workflow Instance Started: " + instance);
//
//         _taskHubWorker.AddTaskOrchestrations(
//             typeof(TOrchestration)
//         );
//
//         // _taskHubWorker.AddTaskActivitiesFromInterface<IManagementSqlOrchestrationTasks>(
//         //     new ManagementSqlOrchestrationTasks());
//         // taskHubWorker.AddTaskActivitiesFromInterface<IMigrationTasks>(new MigrationTasks());
//
//         await _taskHubWorker.StartAsync();
//
//         var taskResult = await _taskHubClient
//             .WaitForOrchestrationAsync(instance, TimeSpan.MaxValue, CancellationToken.None);
//         Console.WriteLine($"Task done: {taskResult?.OrchestrationStatus}");
//
//         await _taskHubWorker.StopAsync(true);
//     }
//
//     public void Dispose()
//     {
//         if (!_isDisposed)
//         {
//             _isDisposed = true;
//             Disposing?.Invoke();
//         }
//     }
// }