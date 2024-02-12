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
    private readonly WolderServiceBuilder _serviceBuilder;

    public GeneratorWorkspaceBuilder(ILoggerFactory loggerFactory, IConfigurationSection rootConfiguration)
    {
        _loggerFactory = loggerFactory;
        _rootConfiguration = rootConfiguration;
        _services = new ServiceCollection();
        _services.AddScoped<PipelineRootPath>();
        _services.AddScoped<ICacheFiles, CacheFiles>();
        _services.AddScoped<ISourceFiles, SourceFiles>();
        _services.AddScoped<GeneratorPipeline>();
        _services.AddScoped<IAIAssistantCacheStore, AIAssistantCacheStore>();
        
        _services.AddTransient<IPipelineContext, PipelineContext>();
        _services.AddTransient<IPipelineActionContext, PipelineActionContext>();
        _services.AddScoped<IPipelineContextFactory, PipelineContextFactory>();
        _services.AddScoped<IPipelineActionContextFactory, PipelineActionContextFactory>();
        
        _services.AddScoped<ActionFactory>(s => 
            ActivatorUtilities.CreateInstance<ActionFactory>(
                s, _definitionToActionTypeMap));
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
        Services.AddScoped<IInvoke<TAction, TParameters, TOutput>, Runner<TAction, TParameters, TOutput>>();
        
        return this;
    }
    
    public GeneratorWorkspaceBuilder AddAction<TActionDefinition>()
        where TActionDefinition : class, IActionDefinition
    {
        var actionType = typeof(TActionDefinition)
            .GetInterfaces()
            .FirstOrDefault(i => 
                i.IsGenericType 
                && i.GetGenericTypeDefinition() == typeof(IActionDefinition<>))
            ?.GetGenericArguments()[0]
            ?? throw new InvalidOperationException("Unable to get pipeline action type.");
        _definitionToActionTypeMap[typeof(TActionDefinition)] = actionType;
        
        Services.AddTransient(actionType);
        
        return this;
    }

    public async Task RunAsync<TRootOrchestration>(string rootPath)
        where TRootOrchestration : IActionPlan
    {
        var serviceProvider = _services.BuildServiceProvider();

        var workspace = ActivatorUtilities.CreateInstance<GeneratorWorkspace>(serviceProvider, rootPath);
        await workspace.RunOrchestrationAsync<TRootOrchestration>();
    }
}