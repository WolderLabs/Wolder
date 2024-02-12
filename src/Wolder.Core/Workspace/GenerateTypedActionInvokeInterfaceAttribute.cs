namespace Wolder.Core.Workspace;

[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public class GenerateTypedActionInvokeInterfaceAttribute<TRunInterface> : Attribute
{
}