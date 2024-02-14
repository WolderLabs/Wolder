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
        _services.AddScoped<ICacheFiles, CacheFiles>();
        _services.AddScoped<ISourceFiles, SourceFiles>();
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
    
    // TODO: Remove and replace with action collections
    public GeneratorWorkspaceBuilder AddAction<TAction>()
        where TAction : IInvokableAction
    {
        // var actionType = typeof(TAction);
        //
        // var generatedAttributeType = actionType.GetCustomAttributes(inherit: false)
        //     .Select(attr => attr.GetType())
        //     .FirstOrDefault(attr =>
        //         attr.IsGenericType &&
        //         attr.GetGenericTypeDefinition() == typeof(GenerateTypedActionInvokeInterfaceAttribute<>));
        // Type? runInterfaceType = null;
        // if (generatedAttributeType is not null)
        // {
        //     runInterfaceType = generatedAttributeType.GetGenericArguments()[0];
        // }
        //
        // var interfaces = actionType.GetInterfaces();
        // foreach (var @interface in interfaces)
        // {
        //     if (!@interface.IsGenericType)
        //     {
        //         if (@interface == typeof(IVoidAction))
        //         {
        //             _services.AddScoped(
        //                 typeof(IInvokeVoid<>).MakeGenericType(typeof(TAction)),
        //                 typeof(InvokeVoid<>).MakeGenericType(typeof(TAction)));
        //             if (runInterfaceType is not null)
        //                 _services.AddScoped(
        //                     runInterfaceType,
        //                     typeof(InvokeVoid<>).MakeGenericType(typeof(TAction)));
        //         }
        //         continue;
        //     }
        //     if (@interface.GetGenericTypeDefinition() == typeof(IAction<>))
        //     {
        //         var outputType = @interface.GetGenericArguments()[0];
        //         _services.AddScoped(
        //             typeof(IInvoke<,>).MakeGenericType(actionType, outputType),
        //             typeof(Invoke<,>).MakeGenericType(actionType, outputType));
        //         if (runInterfaceType is not null)
        //             _services.AddScoped(
        //                 runInterfaceType,
        //                 typeof(Invoke<,>).MakeGenericType(actionType, outputType));
        //     }
        //     else if (@interface.GetGenericTypeDefinition() == typeof(IAction<,>))
        //     {
        //         var parameterType = @interface.GetGenericArguments()[0];
        //         var outputType = @interface.GetGenericArguments()[1];
        //         _services.AddScoped(
        //             typeof(IInvoke<,,>).MakeGenericType(actionType, parameterType, outputType),
        //             typeof(Invoke<,,>).MakeGenericType(actionType, parameterType, outputType));
        //         if (runInterfaceType is not null)
        //             _services.AddScoped(
        //                 runInterfaceType,
        //                 typeof(Invoke<,,>).MakeGenericType(actionType, parameterType, outputType));
        //     }
        //     else if (@interface.GetGenericTypeDefinition() == typeof(IVoidAction<>))
        //     {
        //         var outputType = @interface.GetGenericArguments()[0];
        //         _services.AddScoped(
        //             typeof(IInvokeVoid<,>).MakeGenericType(actionType, outputType),
        //             typeof(InvokeVoid<,>).MakeGenericType(actionType, outputType));
        //         if (runInterfaceType is not null)
        //             _services.AddScoped(
        //                 runInterfaceType,
        //                 typeof(InvokeVoid<,>).MakeGenericType(actionType, outputType));
        //     }
        // }
        //
        return this;
    }

    public async Task InvokeAsync<TRootAction>(string rootPath)
        where TRootAction : IVoidAction
    {
        AddAction<TRootAction>(); // Ensure registered
        
        var serviceProvider = _services.BuildServiceProvider();
        var rootPathService = serviceProvider.GetRequiredService<WorkspaceRootPath>();
        rootPathService.SetRootPath(rootPath);

        var invokeRootAction = serviceProvider.GetRequiredService<IInvoke>();
        await invokeRootAction.InvokeVoidAsync<TRootAction>();
    }
}