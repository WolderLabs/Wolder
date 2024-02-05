using DurableTask.Core;
using DurableTask.Emulator;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Wolder.Core.Files;
using Wolder.Core.Pipeline.DurableTaskInterop;

namespace Wolder.Core.Pipeline;

public class GeneratorActivityPipelineBuilder
{
    private readonly ServiceCollection _services;
    private readonly WolderServiceBuilder _serviceBuilder;
    private readonly TaskHubClient _taskHubClient;
    private readonly TaskHubWorker _taskHubWorker;
    private ServiceProvider? _serviceProvider;
    private IServiceScope? _scope;

    public GeneratorActivityPipelineBuilder(IConfigurationSection rootConfiguration)
    {
        _services = new ServiceCollection();
        var orchestrationServiceAndClient = new LocalOrchestrationService();
        _taskHubClient = new TaskHubClient(orchestrationServiceAndClient);
        _taskHubWorker = new TaskHubWorker(orchestrationServiceAndClient);
        _serviceBuilder = _services.AddWolder(rootConfiguration);
    }

    public WolderServiceBuilder Services => _serviceBuilder;

    private IServiceProvider GetServiceProvider()
    {
        return _scope?.ServiceProvider ?? throw new(nameof(_serviceProvider));
    }

    public void AddActivity<TActivity>()
    {
        // Left off, track the registered types and register them with the hub worker on build
        _taskHubWorker.AddTaskActivities(new ServiceProviderCreator<TaskActivity>(typeof(TActivity), GetServiceProvider));
    }
    
    public void AddOrchestration<TOrchestration>()
    {
        _taskHubWorker.AddTaskOrchestrations(new ServiceProviderCreator<TaskOrchestration>(typeof(TOrchestration), GetServiceProvider));
    }

    public async Task RunAsync<TOrchestration>(string rootPath)
    {
        _serviceProvider = _services.BuildServiceProvider();
        
        // TODO: Scope may no longer be necessary as the services act as their own scope
        _scope = _serviceProvider.CreateScope();

        var rootPathService = _scope.ServiceProvider.GetRequiredService<PipelineRootPath>();
        rootPathService.SetRootPath(rootPath);

        var instance = await _taskHubClient.CreateOrchestrationInstanceAsync(typeof(TOrchestration), "");
    }
}