using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Wolder.Core.Assistants;
using Wolder.Core.Files;

namespace Wolder.Core.Workspace;

public class GeneratorWorkspaceBuilder
{
    private readonly ILoggerFactory _loggerFactory;
    private readonly IConfigurationSection _rootConfiguration;
    private readonly ServiceCollection _services;

    public GeneratorWorkspaceBuilder(ILoggerFactory loggerFactory, IConfigurationSection rootConfiguration)
    {
        _loggerFactory = loggerFactory;
        _rootConfiguration = rootConfiguration;
        _services = new ServiceCollection();
        _services.AddSingleton<WorkspaceRootPath>();
        _services.AddSingleton(loggerFactory);
        _services.Add(ServiceDescriptor.Singleton(typeof(ILogger<>), typeof(Logger<>)));
        _services.AddScoped<IInvoke, InvocationMiddleware>();
        _services.AddSingleton<ICacheFiles, CacheFiles>();
        _services.AddSingleton<ISourceFiles, SourceFiles>();
        _services.AddScoped<IAIAssistantCacheStore, AIAssistantCacheStore>();
    }

    public IServiceCollection Services => _services;
    
    public IConfiguration Config => _rootConfiguration;
    
    public GeneratorWorkspaceBuilder AddActions<TActionCollection>()
        where TActionCollection : class, ITypedActionCollection
    {
        _services.AddScoped<TActionCollection>();
        return this;
    }

    public async Task InvokeAsync<TRootAction>(string rootPath)
        where TRootAction : IVoidAction
    {
        var serviceProvider = _services.BuildServiceProvider();
        var rootPathService = serviceProvider.GetRequiredService<WorkspaceRootPath>();
        rootPathService.SetRootPath(rootPath);

        var invokeRootAction = serviceProvider.GetRequiredService<IInvoke>();
        await invokeRootAction.InvokeVoidAsync<TRootAction>();
    }
}