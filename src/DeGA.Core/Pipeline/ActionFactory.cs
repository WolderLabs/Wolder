using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Core.Pipeline;

public class ActionFactory(
    IReadOnlyDictionary<Type, Type> typeMap,
    IServiceProvider serviceProvider)
{
    public IPipelineAction Create(Type actionDefinitionType)
    {
        if (!typeMap.TryGetValue(actionDefinitionType, out var actionType))
        {
            throw new InvalidOperationException(
                $"The type {actionDefinitionType.FullName} was not registered as an action");
        }
        return (IPipelineAction)serviceProvider.GetRequiredService(actionType);
    }
}