﻿using Wolder.Core.Files;

namespace Wolder.Core.Pipeline;

public class GeneratorPipeline(
    ISourceFiles sourceFiles,
    IPipelineContextFactory contextFactory,
    IPipelineActionContextFactory actionContextFactory,
    ActionFactory actionFactory)
    : IDisposable
{
    private readonly List<IPipelineStep> _steps = new();
    private bool _isDisposed;
    
    internal event Action? Disposing;

    public GeneratorPipeline AddStep<TDefinition>(
        Func<IPipelineContext, TDefinition> parametersFactory)
        where TDefinition : IActionDefinition
    {
        _steps.Add(new PipelineStep<TDefinition>(parametersFactory));
        return this;
    }

    public async Task RunAsync()
    {
        foreach (var step in _steps)
        {
            var action = actionFactory.Create(step.DefinitionType);
            var context = contextFactory.Create();
            var definition = step.GetDefinition(context);
            action.SetParameters(definition);
            var actionContext = actionContextFactory.Create();
            
            await action.ExecuteAsync(actionContext);
        }
    }

    public void Dispose()
    {
        if (!_isDisposed)
        {
            _isDisposed = true;
            Disposing?.Invoke();
        }
    }
}