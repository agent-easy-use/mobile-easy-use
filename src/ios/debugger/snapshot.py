"""SBValue → JSON primitives or LLDB display text; no Frida/native bridge."""

import math
import re
import lldb
from values import checked

MAX_TEXT_BYTES = 64 * 1024


def numeric_storage(value):
    storage = checked(value.GetNonSyntheticValue())
    # Swift numeric values may have a single DWARF storage child.
    if storage.GetNumChildren() == 1:
        storage = checked(storage.GetChildAtIndex(0))
    return storage


def integer(value, signed=False):
    storage = numeric_storage(value)
    error = lldb.SBError()
    number = storage.GetValueAsSigned(error) if signed else storage.GetValueAsUnsigned(error)
    if error.Fail():
        raise RuntimeError(error.GetCString())
    return number


def text(value):
    if len(value.encode('utf-8')) > MAX_TEXT_BYTES:
        raise ValueError('Snapshot text exceeds 64 KiB')
    return value


def native_string(context, reference):
    # Read the actual UTF-8 bytes with an explicit length, preserving embedded NUL.
    # These expressions reference the already-evaluated value, never rerun user code.
    if context.swift:
        prefix = 'import Foundation\n'
        # Persist the bridged NSString so its UTF8String buffer outlives evaluation.
        reference = context.evaluate(prefix + f'{reference} as NSString').GetName()
        length = context.evaluate(prefix + f'({reference} as NSString).lengthOfBytes(using: 4)')
        count = integer(length)
        pointer_code = prefix + f'UInt(bitPattern: ({reference} as NSString).utf8String!)'
    else:
        count = integer(context.evaluate(f'(unsigned long)[(id){reference} lengthOfBytesUsingEncoding:4]'))
        pointer_code = f'(unsigned long long)[(id){reference} UTF8String]'
    if count > MAX_TEXT_BYTES:
        raise ValueError('Snapshot string exceeds 64 KiB')
    if not count:
        return ''
    address = integer(context.evaluate(pointer_code))
    error = lldb.SBError()
    data = context.process.ReadMemory(address, count, error)
    if error.Fail() or len(data) != count:
        raise RuntimeError(error.GetCString() or 'Incomplete string read')
    return data.decode('utf-8')


def snapshot(context, value):
    if value is None:
        return None
    checked(value)
    reference = value.GetName()
    value = checked(value.GetDynamicValue(lldb.eDynamicDontRunTarget))
    type_ = value.GetType().GetCanonicalType()
    name = (type_.GetName() or '').removeprefix('Swift.')
    basic = type_.GetBasicType()

    if name.startswith('Optional<') or name.endswith('?'):
        # Ask Swift to inspect/unwrap the already-evaluated Optional. Formatter
        # child layouts differ across LLDB versions and are not a value contract.
        if integer(context.evaluate(f'({reference}) == nil')):
            return None
        return snapshot(context, context.evaluate(f'({reference})!'))
    if name in {'()', 'Void', 'void'}:
        return None
    if name == 'String':
        return native_string(context, reference)
    if type_.GetTypeFlags() & lldb.eTypeIsObjC:
        error = lldb.SBError()
        address = value.GetValueAsUnsigned(error)
        if error.Fail():
            raise RuntimeError(error.GetCString())
        if address == 0:
            return None
        code = (f'import Foundation\n({reference} as AnyObject) is NSString' if context.swift else
                f'(bool)[(id){reference} isKindOfClass:(id)objc_getClass("NSString")]')
        if integer(context.evaluate(code)):
            return native_string(context, reference)
    if name in {'Bool', 'BOOL', 'bool', '_Bool'} or value.GetTypeName() == 'BOOL' or basic == lldb.eBasicTypeBool:
        return bool(integer(value))
    signed = basic in {lldb.eBasicTypeChar, lldb.eBasicTypeSignedChar, lldb.eBasicTypeShort,
                      lldb.eBasicTypeInt, lldb.eBasicTypeLong, lldb.eBasicTypeLongLong}
    unsigned = basic in {lldb.eBasicTypeUnsignedChar, lldb.eBasicTypeUnsignedShort,
                        lldb.eBasicTypeUnsignedInt, lldb.eBasicTypeUnsignedLong,
                        lldb.eBasicTypeUnsignedLongLong}
    if signed or unsigned or re.fullmatch(r'U?Int(8|16|32|64)?', name):
        number = integer(value, signed or name.startswith('Int'))
        return number if abs(number) <= 2**53 - 1 else str(number)
    if name in {'Float', 'Double'} or basic in {lldb.eBasicTypeFloat, lldb.eBasicTypeDouble}:
        number = float(numeric_storage(value).GetValue())
        return number if math.isfinite(number) else str(number)
    # No recursive object expansion and no automatic description/po call.
    summary = value.GetSummary()
    context.frame()  # Custom formatters may run target code.
    return text(summary or value.GetValue() or f'{value.GetTypeName()} @ {value.GetLocation() or "unknown"}')
