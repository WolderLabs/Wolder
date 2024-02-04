using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Wolder.Core.Pipeline;

namespace Wolder.Core;

public sealed record WolderServiceBuilder(IServiceCollection Services, IConfigurationSection Config)
{
    private readonly Dictionary<Type, Type> _definitionToActionTypeMap = new();
    
    internal IReadOnlyDictionary<Type, Type> DefinitionToActionTypeMap => 
        _definitionToActionTypeMap.AsReadOnly();
    
    public WolderServiceBuilder AddAction<TActionDefinition>()
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
}
