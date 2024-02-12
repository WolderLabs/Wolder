using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
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
        _services.AddScoped<PipelineRootPath>();
        _services.AddScoped<ICacheFiles, CacheFiles>();
        _services.AddScoped<ISourceFiles, SourceFiles>();
        _services.AddScoped<IAIAssistantCacheStore, AIAssistantCacheStore>();
    }

    public IServiceCollection Services => _services;
    
    public IConfiguration Config => _rootConfiguration;
    
    private readonly Dictionary<Type, Type> _definitionToActionTypeMap = new();
    
    internal IReadOnlyDictionary<Type, Type> DefinitionToActionTypeMap => 
        _definitionToActionTypeMap.AsReadOnly();
    
    public GeneratorWorkspaceBuilder AddTypedActionInvoker<TGeneratedRunner>()
        where TGeneratedRunner : IGeneratedRunner
    {
        throw new NotImplementedException();
        return this;
    }
    
    public GeneratorWorkspaceBuilder AddAction<TAction, TParameters, TOutput>()
        where TAction : IAction<TParameters, TOutput>
    {
        Services.AddScoped<IInvoke<TAction, TParameters, TOutput>, Invoke<TAction, TParameters, TOutput>>();
        
        return this;
    }

    public async Task RunAsync<TRootAction>(string rootPath)
        where TRootAction : IVoidAction
    {
        var serviceProvider = _services.BuildServiceProvider();

        // var workspace = ActivatorUtilities.CreateInstance<GeneratorWorkspace>(serviceProvider, rootPath);
        // await workspace.RunOrchestrationAsync<TRootAction>();
    }
}